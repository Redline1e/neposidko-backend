import { supabase } from "../supabaseClient.js";
import { v4 as uuidv4 } from "uuid";

export async function uploadToBucket(buffer, originalName) {
  const ext = originalName.split(".").pop();
  const fileName = `${uuidv4()}.${ext}`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("images")
    .upload(fileName, buffer, {
      contentType: `image/${ext}`,
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { data: urlData, error: urlError } = supabase.storage
    .from("images")
    .getPublicUrl(uploadData.path);
  if (urlError) throw urlError;

  return urlData.publicUrl;
}
