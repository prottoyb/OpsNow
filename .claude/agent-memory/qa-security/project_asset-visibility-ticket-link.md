---
name: asset-visibility-ticket-link
description: Phase 8a — a HIGH finding where GET /tickets/:id/assets leaked full asset records with no asset-level scoping; fixed before Phase 8a completion via a narrow summary DTO
metadata:
  type: project
---

During the Phase 8a QA review (commit `b5a6c12`), `AssetsService.findForTicket`
was found applying only `asset.deletedAt: null` — never `assetVisibilityWhere`
— with `TicketsController.findAssets` carrying no `@Roles`. An Employee who
could see a ticket received the full `AssetResponseDto` (serialNumber,
internal `notes`, `currentAssignee`) for every linked asset, including assets
`GET /assets/:id` 404s for that same caller.

**Fixed** in the Phase 8a review-fixes commit (`2110fdd`): the link routes now
return a narrow `AssetSummaryResponseDto` (id, assetTag, name, status,
assetType) uniformly for every role, and the query no longer loads the
holder relation at all. As of Phase 8a completion the implementation is not
known to retain this leak.

**How to apply:** if any later phase changes `findForTicket`'s response shape
or reintroduces the full asset relation on that path, re-verify an Employee
still cannot read fields `GET /assets/:id` would deny them.
