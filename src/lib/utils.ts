import { createCn } from "cn/config";

// Class merging that knows the app's own type scale from tokens.css.
// Without it `text-label` looks like a color, and `cn("text-label text-accent")` drops it.
export const cn = createCn({
  extend: {
    theme: {
      text: ["title", "heading", "label", "button", "initials", "body", "field", "name", "meta", "note"],
    },
  },
});
