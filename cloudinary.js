const CLOUDINARY_CLOUD_NAME = "hyfsfjdi";
const CLOUDINARY_UPLOAD_PRESET = "jw0mb5uu";

export async function uploadProfileImage(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error("Upload failed. Double check your Cloudinary cloud name and preset.");
  }

  const data = await response.json();
  return data.secure_url;
}
