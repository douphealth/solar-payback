import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { fetchClipCurve, fetchDirectoryProfiles, fetchGeocode, fetchSolarProfile, type ClipCurve, type SolarProfile } from "./pvgis.server";

export type { ClipCurve, SolarProfile } from "./pvgis.server";

const profileInput = z.object({
  lat: z.number().min(-60).max(72), lon: z.number().min(-180).max(180),
  angle: z.number().min(0).max(90).default(30), aspect: z.number().min(-180).max(180).default(0), loss: z.number().min(0).max(40).default(14),
});

export const getSolarProfile = createServerFn({ method: "GET" })
  .inputValidator((d: z.input<typeof profileInput>) => profileInput.parse(d))
  .handler(async ({ data }): Promise<SolarProfile> => {
    setResponseHeader("cache-control", "public, s-maxage=86400, stale-while-revalidate=604800");
    return fetchSolarProfile(data);
  });

const placeInput = z.object({ slug: z.string().regex(/^[a-z0-9-]+$/).max(80), lat: z.number().min(-60).max(72), lon: z.number().min(-180).max(180) });
export const getDirectoryProfiles = createServerFn({ method: "GET" })
  .inputValidator((d: { places: { slug: string; lat: number; lon: number }[] }) => z.object({ places: z.array(placeInput).max(100) }).parse(d))
  .handler(async ({ data }) => {
    setResponseHeader("cache-control", "public, s-maxage=86400, stale-while-revalidate=604800");
    return fetchDirectoryProfiles(data.places);
  });

const geoInput = z.object({ q: z.string().trim().min(2).max(80) });
export const geocode = createServerFn({ method: "GET" })
  .inputValidator((d: z.input<typeof geoInput>) => geoInput.parse(d))
  .handler(async ({ data }) => {
    setResponseHeader("cache-control", "public, s-maxage=86400, stale-while-revalidate=604800");
    return fetchGeocode(data.q);
  });

/** Share of yearly energy kept under an inverter cap, from one year of PVGIS hourly output (null if PVGIS fails). */
export const getClipCurve = createServerFn({ method: "GET" })
  .inputValidator((d: z.input<typeof profileInput>) => profileInput.parse(d))
  .handler(async ({ data }): Promise<ClipCurve | null> => {
    setResponseHeader("cache-control", "public, s-maxage=2592000, stale-while-revalidate=2592000");
    return fetchClipCurve(data);
  });
