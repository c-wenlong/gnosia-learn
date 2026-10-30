import "server-only";

import { ownerScope } from "@gnosia/schema/shared";
import type { TutorDeps } from "@gnosia/tutor/server/deps";
import type { TurnReply } from "@gnosia/tutor/server/turns";
import { NextResponse } from "next/server";

import { assetBlobStore } from "@/lib/blob-store";
import { getCourses } from "@/data/courses";
import { contentSource } from "@/data/source";
import { entryCredential, keyTestCredential, tutorCredentials } from "@/lib/agent/credentials";
import { completeWithFallback, testProviderKey } from "@gnosia/tutor/providers";
import { readAssetDetail, readAssetText } from "@/lib/asset-library";
import { readConceptWorkspace } from "@/lib/concept-workspace";
import { catalogDatabase } from "@/lib/learner-store";
import { readTutorStyle } from "@/lib/settings";
import { cachedModelList } from "@gnosia/tutor/server/model-list";
import { readChain } from "@/lib/tutor-models/store";

/**
 * The seams a tutor endpoint reads through, resolved for one request. The
 * sidecar builds the same object around its own pool and a fixed owner and
 * leaves `seams` unset, so the package's own readers answer; here each is
 * bound to the `@/lib/*` shim that re-exports it, which is the path this
 * app's route tests stub.
 */
export function tutorDeps(owner: string): TutorDeps {
  return {
    // The promise, not the handle: a database that is down rejects inside
    // whichever read asks for it, and that read's own degradation answers.
    db: catalogDatabase(),
    owner,
    scope: ownerScope(owner),
    source: contentSource(),
    blobStore: assetBlobStore(),
    env: process.env,
    seams: {
      courses: () => getCourses(),
      readWorkspace: (deps, slug) => readConceptWorkspace(slug, deps.owner),
      tutorStyle: () => readTutorStyle(),
      credentials: (deps) => tutorCredentials(deps.owner),
      complete: (messages, steps) => completeWithFallback(messages, steps),
      assetDetail: (_deps, id) => readAssetDetail(id),
      assetText: (_deps, db, id, limit) => readAssetText(db, id, limit),
      keyCredential: (deps, provider) => keyTestCredential(deps.owner, provider),
      entryCredential: (deps, provider, model) => entryCredential(deps.owner, provider, model),
      chain: (deps) => readChain(deps.owner),
      modelList: (o, credential) => cachedModelList(o, credential),
      testKey: (credential) => testProviderKey(credential),
    },
  };
}

/** Map a turn's plain reply onto the Next response the route answers with. */
export function turnResponse({ status, body, headers }: TurnReply): NextResponse {
  return NextResponse.json(body, { status, headers });
}
