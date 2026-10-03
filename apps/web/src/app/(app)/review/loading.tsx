import { PageLoading } from "@/components/PageLoading";

/** Review is a focus page: its frame has no top bar from 768px up, as the page has none. */
export default function Loading() {
  return <PageLoading layout="focus" />;
}
