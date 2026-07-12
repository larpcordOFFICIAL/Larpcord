const GIPHY_API_KEY = "08cSmexhrY5nVHE0J3R5bk5ICuUuUnTk";

export async function searchGifs(query) {
  const url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=15&rating=pg-13`;
  const res = await fetch(url);
  const data = await res.json();
  return data.data.map((gif) => ({
    id: gif.id,
    preview: gif.images.fixed_height_small.url,
    full: gif.images.fixed_height.url
  }));
}
