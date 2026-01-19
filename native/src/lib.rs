#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use image::{DynamicImage, ImageFormat, GenericImageView};
use std::io::Cursor;
use fast_image_resize as fr;
use std::num::NonZeroU32;

#[napi]
pub fn optimize_for_ocr(buffer: Buffer) -> Result<Buffer> {
  println!("📊 Rust: получен buffer размером {} bytes", buffer.len());
  
  let img = image::load_from_memory(&buffer)
    .map_err(|e| Error::from_reason(format!("Failed to load image: {}", e)))?;

  let (width, height) = img.dimensions();
  println!("📊 Rust: оригинальный размер {}x{}", width, height);

  // Быстрый resize с fast_image_resize
  let resized = fast_resize(img, 1920, 1080)?;
  
  let (new_width, new_height) = resized.dimensions();
  println!("📊 Rust: после resize {}x{}", new_width, new_height);

  // Grayscale
  let grayscale = resized.to_luma8();

  let mut output = Cursor::new(Vec::new());
  DynamicImage::ImageLuma8(grayscale)
    .write_to(&mut output, ImageFormat::Png)
    .map_err(|e| Error::from_reason(format!("Failed to write image: {}", e)))?;

  let output_size = output.get_ref().len();
  println!("📊 Rust: выходной buffer {} bytes", output_size);

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

  // Оборачиваем в NonZeroU32
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