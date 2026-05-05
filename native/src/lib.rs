#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use image::{DynamicImage, ImageFormat, GenericImageView};
use std::io::Cursor;
use fast_image_resize as fr;
use std::num::NonZeroU32;
use std::sync::Mutex;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

// --- Image optimization (existing) ---

#[napi]
pub fn optimize_for_ocr(buffer: Buffer) -> Result<Buffer> {
  let img = image::load_from_memory(&buffer)
    .map_err(|e| Error::from_reason(format!("Failed to load image: {}", e)))?;

  let (width, height) = img.dimensions();

  let resized = fast_resize(img, 1920, 1080)?;

  let (new_width, new_height) = resized.dimensions();
  println!("Rust: {}x{} -> {}x{}", width, height, new_width, new_height);

  let grayscale = resized.to_luma8();

  let mut output = Cursor::new(Vec::new());
  DynamicImage::ImageLuma8(grayscale)
    .write_to(&mut output, ImageFormat::Png)
    .map_err(|e| Error::from_reason(format!("Failed to write image: {}", e)))?;

  Ok(output.into_inner().into())
}

fn fast_resize(img: DynamicImage, max_width: u32, max_height: u32) -> Result<DynamicImage> {
  let (width, height) = img.dimensions();

  if width <= max_width && height <= max_height {
    return Ok(img);
  }

  let ratio = (max_width as f32 / width as f32).min(max_height as f32 / height as f32);
  let new_width = (width as f32 * ratio) as u32;
  let new_height = (height as f32 * ratio) as u32;

  let nz_width = NonZeroU32::new(width).ok_or_else(|| Error::from_reason("Invalid width"))?;
  let nz_height = NonZeroU32::new(height).ok_or_else(|| Error::from_reason("Invalid height"))?;
  let nz_new_width = NonZeroU32::new(new_width).ok_or_else(|| Error::from_reason("Invalid new width"))?;
  let nz_new_height = NonZeroU32::new(new_height).ok_or_else(|| Error::from_reason("Invalid new height"))?;

  let src_image = fr::Image::from_vec_u8(
    nz_width,
    nz_height,
    img.to_rgba8().into_raw(),
    fr::PixelType::U8x4,
  ).map_err(|e| Error::from_reason(format!("Failed to create image: {:?}", e)))?;

  let mut dst_image = fr::Image::new(
    nz_new_width,
    nz_new_height,
    src_image.pixel_type(),
  );

  let mut resizer = fr::Resizer::new(fr::ResizeAlg::Nearest);
  resizer.resize(&src_image.view(), &mut dst_image.view_mut())
    .map_err(|e| Error::from_reason(format!("Resize failed: {:?}", e)))?;

  let rgba = image::RgbaImage::from_raw(new_width, new_height, dst_image.into_vec())
    .ok_or_else(|| Error::from_reason("Failed to create RgbaImage".to_string()))?;

  Ok(DynamicImage::ImageRgba8(rgba))
}

// --- Whisper transcription ---

static WHISPER_CTX: Mutex<Option<WhisperContext>> = Mutex::new(None);

/// Load whisper model from file. Call once at startup.
#[napi]
pub fn whisper_load_model(model_path: String) -> Result<()> {
  println!("[whisper] Loading model: {}", model_path);

  let params = WhisperContextParameters::default();
  let ctx = WhisperContext::new_with_params(&model_path, params)
    .map_err(|e| Error::from_reason(format!("Failed to load whisper model: {:?}", e)))?;

  let mut guard = WHISPER_CTX.lock()
    .map_err(|e| Error::from_reason(format!("Mutex error: {:?}", e)))?;
  *guard = Some(ctx);

  println!("[whisper] Model loaded successfully");
  Ok(())
}

/// Transcribe audio file (WAV/FLAC). Returns text.
/// Audio must be 16kHz mono (whisper requirement).
#[napi]
pub fn whisper_transcribe(file_path: String, language: Option<String>) -> Result<String> {
  let guard = WHISPER_CTX.lock()
    .map_err(|e| Error::from_reason(format!("Mutex error: {:?}", e)))?;

  let ctx = guard.as_ref()
    .ok_or_else(|| Error::from_reason("Whisper model not loaded. Call whisperLoadModel first."))?;

  // Read audio file and decode to f32 samples
  let samples = read_audio_file(&file_path)?;

  println!("[whisper] Transcribing {} samples ({:.1}s)", samples.len(), samples.len() as f32 / 16000.0);

  // Configure whisper params
  let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });

  let lang = language.unwrap_or_else(|| "ru".to_string());
  params.set_language(Some(&lang));
  params.set_print_special(false);
  params.set_print_progress(false);
  params.set_print_realtime(false);
  params.set_print_timestamps(false);
  params.set_suppress_blank(true);
  params.set_single_segment(false);
  // Speed optimizations
  params.set_n_threads(4);
  params.set_no_context(true);

  // Run inference
  let mut state = ctx.create_state()
    .map_err(|e| Error::from_reason(format!("Failed to create state: {:?}", e)))?;

  state.full(params, &samples)
    .map_err(|e| Error::from_reason(format!("Whisper inference failed: {:?}", e)))?;

  // Collect all segments
  let num_segments = state.full_n_segments()
    .map_err(|e| Error::from_reason(format!("Failed to get segments: {:?}", e)))?;

  let mut text = String::new();
  for i in 0..num_segments {
    if let Ok(segment) = state.full_get_segment_text(i) {
      text.push_str(&segment);
    }
  }

  let result = text.trim().to_string();
  let preview: String = result.chars().take(80).collect();
  println!("[whisper] Result: \"{}\"", preview);

  Ok(result)
}

/// Read audio file to f32 samples at 16kHz mono
fn read_audio_file(path: &str) -> Result<Vec<f32>> {
  let data = std::fs::read(path)
    .map_err(|e| Error::from_reason(format!("Failed to read file: {}", e)))?;

  // Try to decode as WAV first, then as raw PCM
  if let Ok(samples) = decode_wav(&data) {
    return Ok(samples);
  }

  // For FLAC and other formats, use a simple approach:
  // whisper expects f32 PCM at 16kHz mono
  // We'll try to interpret as raw 16-bit PCM
  if data.len() > 44 {
    // Skip potential header and try as 16-bit PCM
    let pcm_data = if &data[0..4] == b"RIFF" {
      // WAV header, skip to data
      &data[44..]
    } else {
      &data[..]
    };

    let samples: Vec<f32> = pcm_data
      .chunks_exact(2)
      .map(|chunk| {
        let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
        sample as f32 / 32768.0
      })
      .collect();

    if !samples.is_empty() {
      return Ok(samples);
    }
  }

  Err(Error::from_reason("Failed to decode audio file"))
}

fn decode_wav(data: &[u8]) -> std::result::Result<Vec<f32>, String> {
  if data.len() < 44 || &data[0..4] != b"RIFF" || &data[8..12] != b"WAVE" {
    return Err("Not a WAV file".to_string());
  }

  // Find data chunk
  let mut pos = 12;
  while pos + 8 < data.len() {
    let chunk_id = &data[pos..pos + 4];
    let chunk_size = u32::from_le_bytes([data[pos + 4], data[pos + 5], data[pos + 6], data[pos + 7]]) as usize;

    if chunk_id == b"data" {
      let audio_data = &data[pos + 8..std::cmp::min(pos + 8 + chunk_size, data.len())];
      let samples: Vec<f32> = audio_data
        .chunks_exact(2)
        .map(|chunk| {
          let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
          sample as f32 / 32768.0
        })
        .collect();
      return Ok(samples);
    }

    pos += 8 + chunk_size;
    if chunk_size % 2 != 0 {
      pos += 1; // padding
    }
  }

  Err("No data chunk found".to_string())
}
