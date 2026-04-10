import type { Env } from "../types";

export async function pinataUpload(
  env: Env,
  fileData: ArrayBuffer,
  filename: string
): Promise<{ cid: string }> {
  const formData = new FormData();
  formData.append("file", new Blob([fileData]), filename);
  formData.append(
    "pinataMetadata",
    JSON.stringify({ name: filename })
  );

  const res = await fetch(
    "https://api.pinata.cloud/pinning/pinFileToIPFS",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${env.PINATA_JWT}` },
      body: formData,
    }
  );

  if (!res.ok) {
    throw new Error(`Pinata upload failed: ${res.status}`);
  }

  const result = await res.json<{ IpfsHash: string }>();
  return { cid: result.IpfsHash };
}
