# Short-time Yoga x AI Motive Skeleton

This package only ships data contracts and placeholder UI atoms for the MVP that combines short yoga sets with an AI motivation chat. No routing or pages are included.

## Contents
- `/data/types.ts` centralises every shared type.
- `/data/poses.ts` and `/data/sequences.ts` export empty arrays ready for real content.
- `/data/constants.ts` stores simple defaults such as the default language.
- `/components` hosts minimal Tailwind-ready building blocks (`Timer`, `PoseCard`, `StepPlayer`).
- `/lib/utils.ts` contains tiny helpers like `createUuid` and `formatSeconds`.

## Usage
1. Import the placeholder components into any React playground (Vite, Next.js, Storybook, etc.).
2. Provide mock data for `poses` and `sequence` when wiring `StepPlayer` so you can iterate on UI without backend data.
3. Tailwind classes are inlined; ensure your host project has a Tailwind pipeline before rendering.

## Extension ideas
- Replace placeholder images with production-ready assets or wire a CDN uploader.
- Fill the `video` field in `Pose` when moving to video lessons (providers enumerated via `VideoProvider`).
- Connect to Supabase/Dify once backend contracts are ready; the current types are ready for localisation via `LangText`.
