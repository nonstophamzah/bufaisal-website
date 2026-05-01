export async function uploadToCloudinary(file: Blob): Promise<string> {
  const fd = new FormData();
  fd.append('file', file, 'photo.jpg');
  fd.append('upload_preset', 'bufaisal_unsigned');
  const res = await fetch(
    'https://api.cloudinary.com/v1_1/df8y0k626/image/upload',
    { method: 'POST', body: fd }
  );
  const data = await res.json();
  if (!data.secure_url) throw new Error(data.error?.message || 'Upload failed');
  return data.secure_url;
}
