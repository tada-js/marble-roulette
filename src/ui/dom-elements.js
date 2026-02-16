/**
 * Resolve and return all app DOM elements used by main bootstrap.
 */
export function getAppElements() {
  return {
    canvas: document.getElementById("game"),
    startBtn: document.getElementById("start-btn"),
    pauseBtn: document.getElementById("pause-btn"),
    settingsBtn: document.getElementById("settings-btn"),
    inquiryBtn: document.getElementById("inquiry-btn"),
    bgmBtn: document.getElementById("bgm-btn"),
    winnerBtn: document.getElementById("winner-btn"),
    ballsEl: document.getElementById("balls"),
    minimap: document.getElementById("minimap"),
    viewLockEl: document.getElementById("view-lock"),
    minimapHintEl: document.getElementById("minimap-hint"),
    canvasCoordReadoutEl: document.getElementById("canvas-coord-readout"),
    canvasCoordCopyBtn: document.getElementById("canvas-coord-copy"),
    minimapTitleEl: document.getElementById("minimap-title"),

    settingsDialog: document.getElementById("settings-dialog"),
    settingsList: document.getElementById("settings-list"),
    restoreDefaultsBtn: document.getElementById("restore-defaults"),
    addBallBtn: document.getElementById("add-ball"),

    winnerDialog: document.getElementById("winner-dialog"),
    winnerImgEl: document.getElementById("winner-img"),
    winnerNameEl: document.getElementById("winner-name"),

    inquiryDialog: document.getElementById("inquiry-dialog"),
    inquiryForm: document.getElementById("inquiry-form"),
    inquiryNameInput: document.getElementById("inq-name"),
    inquiryEmailInput: document.getElementById("inq-email"),
    inquirySubjectInput: document.getElementById("inq-subject"),
    inquiryMessageInput: document.getElementById("inq-message"),
    inquiryMessageCountEl: document.getElementById("inq-message-count"),
    inquiryWebsiteInput: document.getElementById("inq-website"),
    inquirySendBtn: document.getElementById("inquiry-send"),
    inquiryStatusEl: document.getElementById("inquiry-status"),
  };
}
