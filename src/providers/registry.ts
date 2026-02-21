import type { ServerListing } from "../types.js";
import { hetznerProvider } from "./hetzner.js";
import { ovhProvider } from "./ovh.js";

const providers = [hetznerProvider, ovhProvider];

export function getProviderNames(): string[] {
  return providers.map((p) => p.name);
}

export async function getAllListings(
  providerFilter?: string,
): Promise<ServerListing[]> {
  const selected =
    providerFilter && providerFilter !== "all"
      ? providers.filter((p) => p.name === providerFilter)
      : providers;

  const results = await Promise.all(
    selected.map((p) => p.fetchListings().catch(() => [] as ServerListing[])),
  );
  return results.flat();
}

export async function getListingById(
  id: string,
  providerFilter?: string,
): Promise<ServerListing | undefined> {
  const listings = await getAllListings(providerFilter);
  return listings.find((l) => l.id === id);
}
