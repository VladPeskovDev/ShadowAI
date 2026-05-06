#![deny(clippy::all)]
#![allow(clippy::needless_return)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use image::{DynamicImage, ImageFormat, GenericImageView};
use std::io::Cursor;
use fast_image_resize as fr;
use std::num::NonZeroU32;
use std::sync::{Mutex, Arc, atomic::{AtomicBool, Ordering}};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};
use screencapturekit::sc_shareable_content::SCShareableContent;
use screencapturekit::sc_stream::SCStream;
use screencapturekit::sc_stream_configuration::SCStreamConfiguration;
use screencapturekit::sc_content_filter::{SCContentFilter, InitParams};
use screencapturekit::sc_output_handler::{SCStreamOutputType, StreamOutput};
use screencapturekit::cm_sample_buffer::CMSampleBuffer;

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

// --- System Audio Capture via ScreenCaptureKit ---

struct ErrorHandler;

impl screencapturekit::sc_error_handler::StreamErrorHandler for ErrorHandler {
  fn on_error(&self) {
    eprintln!("[system-audio] Stream error occurred");
  }
}

struct AudioOutput {
  samples: Arc<Mutex<Vec<f32>>>,
  output_dir: Arc<Mutex<String>>,
  chunk_duration_secs: f32,
  sample_rate: u32,
  chunk_counter: Arc<Mutex<u32>>,
}

impl StreamOutput for AudioOutput {
  fn did_output_sample_buffer(&self, sample: CMSampleBuffer, of_type: SCStreamOutputType) {
    if let SCStreamOutputType::Audio = of_type {
      // Safety: catch panics from null pointers in objc bindings
      let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        sample.sys_ref.get_av_audio_buffer_list()
      }));

      let audio_buffers = match result {
        Ok(buffers) => buffers,
        Err(_) => {
          // Null pointer or invalid buffer — skip silently
          return;
        }
      };

      for buffer in audio_buffers {
        let data = &buffer.data;
        if data.is_empty() || data.len() < 4 {
          continue;
        }

        // ScreenCaptureKit returns f32 samples at 48kHz
        let new_samples: Vec<f32> = data.chunks_exact(4)
          .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
          .collect();

        let mut samples = self.samples.lock().unwrap();
        samples.extend_from_slice(&new_samples);

        // Check if we have enough for a chunk
        let chunk_samples = (self.chunk_duration_secs * self.sample_rate as f32) as usize;
        if samples.len() >= chunk_samples {
          let chunk: Vec<f32> = samples.drain(..chunk_samples).collect();
          let output_dir = self.output_dir.lock().unwrap().clone();
          let mut counter = self.chunk_counter.lock().unwrap();
          *counter += 1;
          let idx = *counter;

          // Write chunk to WAV file (16kHz mono for whisper)
          let resampled = resample_to_16k_mono(&chunk, self.sample_rate);
          let chunk_path = format!("{}/sys_chunk_{:04}.wav", output_dir, idx);
          if let Err(e) = write_wav_file(&chunk_path, &resampled, 16000) {
            eprintln!("[system-audio] Write error: {}", e);
          } else {
            println!("[system-audio] Chunk saved: {}", chunk_path);
          }
        }
      }
    }
  }
}

static AUDIO_STREAM: Mutex<Option<SCStream>> = Mutex::new(None);
static AUDIO_ACTIVE: AtomicBool = AtomicBool::new(false);

/// Start capturing system audio. Saves WAV chunks to output_dir.
#[napi]
pub fn start_system_audio_capture(output_dir: String, chunk_duration_secs: Option<f64>) -> Result<()> {
  let duration = chunk_duration_secs.unwrap_or(10.0) as f32;

  println!("[system-audio] Starting capture, chunks: {}s, dir: {}", duration, output_dir);

  std::fs::create_dir_all(&output_dir)
    .map_err(|e| Error::from_reason(format!("Failed to create dir: {}", e)))?;

  let content = SCShareableContent::current();
  let display = content.displays.first()
    .ok_or_else(|| Error::from_reason("No display found"))?
    .clone();

  let config = SCStreamConfiguration {
    width: 1,
    height: 1,
    captures_audio: true,
    sample_rate: 48000,
    channel_count: 1,
    excludes_current_process_audio: true,
    ..Default::default()
  };

  let filter = SCContentFilter::new(InitParams::Display(display));

  AUDIO_ACTIVE.store(true, Ordering::Relaxed);

  let output = AudioOutput {
    samples: Arc::new(Mutex::new(Vec::new())),
    output_dir: Arc::new(Mutex::new(output_dir)),
    chunk_duration_secs: duration,
    sample_rate: 48000,
    chunk_counter: Arc::new(Mutex::new(0)),
  };

  let mut stream = SCStream::new(filter, config, ErrorHandler);
  stream.add_output(output, SCStreamOutputType::Audio);
  stream.start_capture()
    .map_err(|e| Error::from_reason(format!("Failed to start capture: {:?}", e)))?;

  let mut guard = AUDIO_STREAM.lock()
    .map_err(|e| Error::from_reason(format!("Mutex error: {:?}", e)))?;
  *guard = Some(stream);

  println!("[system-audio] Capture started");
  Ok(())
}

/// Stop capturing system audio.
#[napi]
pub fn stop_system_audio_capture() -> Result<()> {
  AUDIO_ACTIVE.store(false, Ordering::Relaxed);

  let mut guard = AUDIO_STREAM.lock()
    .map_err(|e| Error::from_reason(format!("Mutex error: {:?}", e)))?;

  if let Some(stream) = guard.take() {
    stream.stop_capture()
      .map_err(|e| Error::from_reason(format!("Failed to stop capture: {:?}", e)))?;
  }

  println!("[system-audio] Capture stopped");
  Ok(())
}

/// Check if system audio capture is active
#[napi]
pub fn is_system_audio_active() -> bool {
  AUDIO_ACTIVE.load(Ordering::Relaxed)
}

// Resample f32 audio from src_rate to 16000 Hz mono
fn resample_to_16k_mono(samples: &[f32], src_rate: u32) -> Vec<f32> {
  if src_rate == 16000 {
    return samples.to_vec();
  }

  let ratio = 16000.0 / src_rate as f64;
  let output_len = (samples.len() as f64 * ratio) as usize;
  let mut output = Vec::with_capacity(output_len);

  for i in 0..output_len {
    let src_idx = i as f64 / ratio;
    let idx = src_idx as usize;
    let frac = src_idx - idx as f64;

    let s0 = samples.get(idx).copied().unwrap_or(0.0);
    let s1 = samples.get(idx + 1).copied().unwrap_or(s0);
    let sample = s0 as f64 * (1.0 - frac) + s1 as f64 * frac;
    output.push(sample as f32);
  }

  output
}

fn write_wav_file(path: &str, samples: &[f32], sample_rate: u32) -> std::result::Result<(), String> {
  let spec = hound::WavSpec {
    channels: 1,
    sample_rate,
    bits_per_sample: 16,
    sample_format: hound::SampleFormat::Int,
  };

  let mut writer = hound::WavWriter::create(path, spec)
    .map_err(|e| format!("WavWriter create failed: {}", e))?;

  for &sample in samples {
    let s = (sample * 32767.0).clamp(-32768.0, 32767.0) as i16;
    writer.write_sample(s)
      .map_err(|e| format!("Write sample failed: {}", e))?;
  }

  writer.finalize()
    .map_err(|e| format!("Finalize failed: {}", e))?;

  Ok(())
}

