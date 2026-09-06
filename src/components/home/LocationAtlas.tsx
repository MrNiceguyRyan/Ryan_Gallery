import { getMapboxToken } from '../../config/mapbox';

interface Props {
  latitude: number;
  longitude: number;
}

export default function LocationAtlas({ latitude, longitude }: Props) {
  const token = getMapboxToken();
  const staticMapUrl = `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${longitude},${latitude},9.2,0/960x480@2x?access_token=${encodeURIComponent(token)}`;

  return (
    <div className="location-atlas absolute inset-0 overflow-hidden bg-[#171a15]">
      <img
        src={staticMapUrl}
        alt=""
        aria-hidden="true"
        className="h-full w-full object-cover opacity-80"
        loading="lazy"
        decoding="async"
        draggable={false}
      />
      <span className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center" aria-hidden="true">
        <span className="absolute h-8 w-8 rounded-full border border-[#D2FF00]/45 route-marker-ping" />
        <span className="relative h-3 w-3 rounded-full border border-[#D2FF00] bg-[#D2FF00] shadow-[0_0_18px_rgba(210,255,0,0.9)]" />
      </span>
      <div className="pointer-events-none absolute inset-0 bg-[#171a15]/20 shadow-[inset_0_0_70px_rgba(4,6,3,0.72)]" />
    </div>
  );
}
