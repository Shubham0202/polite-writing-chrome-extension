// "*.example.com" covers every subdomain of example.com; any other entry is one exact hostname.
export const matchesSite = (site: string, hostname: string): boolean =>
  site.startsWith('*.') ? hostname.endsWith(site.slice(1)) : site === hostname
