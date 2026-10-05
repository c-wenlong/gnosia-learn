import { PageLoading } from "@/components/PageLoading";

/**
 * A concept session is a focus page: its frame has no sidebar from 768px up,
 * as the page has none, so arriving from the workspace does not draw the
 * sidebar for a beat and then take it away.
 */
export default function Loading() {
  return <PageLoading layout="focus" />;
}
