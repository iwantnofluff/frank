import { BrandPartPage } from "@/components/settings/BrandPartPage";

// Colour presets and every interface and status colour, on one page
// (direct instruction), saved together.
export default function BrandColoursPage() {
  return (
    <BrandPartPage
      part="colours"
      title="Brand Colours"
      description="Pick a ready-made look or set each colour yourself. Changes preview across the app until you save."
    />
  );
}
