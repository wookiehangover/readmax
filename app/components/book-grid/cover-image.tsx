import { useEffect, useState } from "react";

export function CoverImage({ coverImage, alt }: { coverImage: Blob; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(coverImage);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [coverImage]);

  if (!url) return null;

  return <img src={url} alt={alt} className="aspect-[2/3] w-full rounded-lg object-cover" />;
}
