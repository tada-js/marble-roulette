import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Design System/Tokens",
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const colorTokens = [
  { name: "--bg0", value: "var(--bg0)" },
  { name: "--bg1", value: "var(--bg1)" },
  { name: "--ink", value: "var(--ink)" },
  { name: "--muted", value: "var(--muted)" },
  { name: "--stroke", value: "var(--stroke)" },
  { name: "--accent", value: "var(--accent)" },
  { name: "--accent2", value: "var(--accent2)" },
  { name: "--danger", value: "var(--danger)" },
];

export const Overview: Story = {
  render: () => (
    <div style={{ padding: 24, color: "var(--ink)", fontFamily: "var(--sans)" }}>
      <h2 style={{ marginTop: 0 }}>Degururu Design Tokens</h2>
      <p style={{ color: "var(--muted)", marginTop: 4 }}>
        버튼/모달/폼 컴포넌트가 공유하는 핵심 토큰입니다.
      </p>

      <section style={{ marginTop: 20 }}>
        <h3 style={{ marginBottom: 10 }}>Color</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          {colorTokens.map((token) => (
            <div
              key={token.name}
              style={{
                border: "1px solid var(--stroke)",
                borderRadius: 12,
                padding: 10,
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <div
                style={{
                  height: 56,
                  borderRadius: 8,
                  background: token.value,
                  border: "1px solid rgba(255,255,255,0.2)",
                }}
              />
              <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700 }}>{token.name}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h3 style={{ marginBottom: 10 }}>Control Size</h3>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ height: "var(--ctrl-h-sm)", padding: "0 var(--ctrl-px-sm)", border: "1px solid var(--stroke)", borderRadius: 10, display: "inline-flex", alignItems: "center" }}>
            sm
          </div>
          <div style={{ height: "var(--ctrl-h-md)", padding: "0 var(--ctrl-px-md)", border: "1px solid var(--stroke)", borderRadius: 12, display: "inline-flex", alignItems: "center" }}>
            md
          </div>
          <div style={{ height: "var(--ctrl-h-lg)", padding: "0 var(--ctrl-px-lg)", border: "1px solid var(--stroke)", borderRadius: 14, display: "inline-flex", alignItems: "center" }}>
            lg
          </div>
        </div>
      </section>
    </div>
  ),
};
