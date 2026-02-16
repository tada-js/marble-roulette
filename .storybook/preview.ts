import type { Preview } from "@storybook/react-vite";
import "../styles.css";

const preview: Preview = {
  parameters: {
    layout: "centered",
    controls: { expanded: true },
    backgrounds: {
      default: "degururu",
      values: [
        { name: "degururu", value: "#0b1220" },
        { name: "dark", value: "#111827" },
        { name: "light", value: "#f3f4f6" },
      ],
    },
  },
};

export default preview;
