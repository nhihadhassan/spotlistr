export type SpotifyImage = {
  url: string;
  height: number | null;
  width: number | null;
};

export type SpotifyArtist = {
  id: string;
  name: string;
};

export type SpotifyAlbum = {
  id: string;
  name: string;
  images: SpotifyImage[];
  release_date: string;
  release_date_precision: "year" | "month" | "day";
};

export type SpotifyTrack = {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  explicit: boolean;
  popularity: number;
  album: SpotifyAlbum;
  artists: SpotifyArtist[];
  external_ids?: { isrc?: string };
  is_playable?: boolean;
};

export type SpotifyPlaylist = {
  id: string;
  name: string;
  description: string | null;
  public: boolean | null;
  collaborative: boolean;
  images: SpotifyImage[];
  owner: { id: string; display_name: string | null };
  tracks: { total: number };
};

export type SpotifyPaged<T> = {
  items: T[];
  next: string | null;
  total: number;
  limit: number;
  offset: number;
};

export type SpotifyUser = {
  id: string;
  display_name: string | null;
  images: SpotifyImage[];
};
