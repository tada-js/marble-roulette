import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, IconButton } from "../../src/ui-react/components/button";

const meta = {
  title: "Design System/Button",
  component: Button,
  tags: ["autodocs"],
  args: {
    children: "버튼",
    variant: "ghost",
    size: "md",
    disabled: false,
  },
  argTypes: {
    onClick: { action: "clicked" },
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Ghost: Story = {};

export const Primary: Story = {
  args: {
    children: "게임 시작",
    variant: "primary",
  },
};

export const Danger: Story = {
  args: {
    children: "삭제",
    variant: "danger",
  },
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Button size="sm">작게</Button>
      <Button size="md">기본</Button>
      <Button size="lg">크게</Button>
    </div>
  ),
};

export const Icon: Story = {
  render: () => (
    <IconButton ariaLabel="설정" title="설정">
      <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 14, height: 14 }}>
        <path
          fill="currentColor"
          d="M19.43 12.98a7.83 7.83 0 0 0 .06-.98 7.83 7.83 0 0 0-.06-.98l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.6-.22l-2.49 1a7.14 7.14 0 0 0-1.69-.98l-.38-2.65A.5.5 0 0 0 14 1h-4a.5.5 0 0 0-.49.42l-.38 2.65c-.6.23-1.16.56-1.68.98l-2.5-1a.5.5 0 0 0-.6.22l-2 3.46a.5.5 0 0 0 .12.64l2.11 1.65A7.83 7.83 0 0 0 4.51 12c0 .33.02.66.06.98l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46a.5.5 0 0 0 .6.22l2.5-1c.52.42 1.08.75 1.68.98l.38 2.65A.5.5 0 0 0 10 23h4a.5.5 0 0 0 .49-.42l.38-2.65c.6-.23 1.16-.56 1.69-.98l2.49 1a.5.5 0 0 0 .6-.22l2-3.46a.5.5 0 0 0-.12-.64zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z"
        />
      </svg>
    </IconButton>
  ),
};
