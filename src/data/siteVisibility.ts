export const siteVisibility = {
  stage: "launch" as "draft" | "launch",
  allowAiSearchBotsAtLaunch: true,
  allowTrainingBotsAtLaunch: false,
};

export function isDraftStage() {
  return siteVisibility.stage === "draft";
}
