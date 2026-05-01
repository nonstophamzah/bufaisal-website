import { permanentRedirect } from 'next/navigation';

// All v1 inventory has been archived. The /item/[uuid] URL space no longer
// has 1:1 equivalents in the new /[category]/[slug] structure, so we send
// every legacy product URL to the homepage with a 301.
export default function LegacyItemRedirect() {
  permanentRedirect('/');
}
