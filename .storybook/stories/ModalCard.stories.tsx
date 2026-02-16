import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../../src/ui-react/components/button";
import { ModalCard } from "../../src/ui-react/components/modal";

const meta = {
  title: "Design System/ModalCard",
  component: ModalCard,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ModalCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SettingsStyle: Story = {
  render: () => (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background:
          "radial-gradient(1200px 900px at 20% 10%, rgba(255,176,0,0.12), transparent 60%), linear-gradient(180deg, #0b1220, #1b2a4a)",
      }}
    >
      <ModalCard
        className="settingsModal twModal__card--scrollable"
        size="lg"
        title="공 설정"
        description="공을 추가/삭제하고, 이름과 이미지를 바꿀 수 있어요."
        onClose={() => {
          // story action placeholder
        }}
        footer={
          <div className="settingsFooter">
            <div className="settingsFooter__left">
              <Button variant="ghost">공 추가</Button>
              <Button variant="ghost">기본값 복원</Button>
            </div>
            <div className="settingsFooter__right">
              <Button variant="primary">적용</Button>
              <Button variant="ghost">닫기</Button>
            </div>
          </div>
        }
      >
        <div className="twList">
          <div className="twItem">
            <div className="twItem__head">
              <div className="twItem__thumb"></div>
              <div className="twItem__headMeta">
                <div className="twItem__headLabel">공 ID</div>
                <div className="twItem__idBadge">dog</div>
              </div>
            </div>
            <div className="twItem__grid">
              <div className="field">
                <label>이름</label>
                <input type="text" value="강아지" readOnly />
              </div>
              <div className="field">
                <label>이미지</label>
                <input type="text" value="file.png" readOnly />
              </div>
            </div>
          </div>
        </div>
      </ModalCard>
    </div>
  ),
};

export const WinnerStyle: Story = {
  render: () => (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background:
          "radial-gradient(800px 700px at 75% 15%, rgba(69,243,195,0.12), transparent 60%), linear-gradient(180deg, #0b1220, #1b2a4a)",
      }}
    >
      <ModalCard
        size="md"
        title="마지막 결과"
        description="마지막으로 도착한 공을 확인하세요."
        onClose={() => {
          // story action placeholder
        }}
        footer={<Button variant="primary">확인</Button>}
      >
        <div className="twWinner">
          <div className="twWinner__thumb"></div>
          <div className="twWinner__copy">
            <div className="twWinner__k">마지막 도착</div>
            <div className="twWinner__v">강아지</div>
          </div>
        </div>
      </ModalCard>
    </div>
  ),
};
