const WAVE_COLORS = [
  "#000000", "#0f1318", "#1e2730", "#2d3b49", "#3d4e61",
  "#4c627a", "#5b7692", "#6b89aa", "#7a9dc3", "#89b1db", "#99c5f4",
];

export function runTitleWave(
  letterColors: string[],
  onUpdate: (colors: string[]) => void,
  durationMs = 3000,
) {
  const totalLetters = letterColors.length;
  const stagger = durationMs / (totalLetters + (WAVE_COLORS.length - 1));

  for (let i = 0; i < totalLetters; i++) {
    setTimeout(() => {
      let step = 0;
      const iv = setInterval(() => {
        if (step < WAVE_COLORS.length) {
          letterColors[i] = WAVE_COLORS[step];
          onUpdate([...letterColors]);
          step++;
        } else {
          const revStep = step - WAVE_COLORS.length;
          if (revStep < WAVE_COLORS.length) {
            letterColors[i] = WAVE_COLORS[WAVE_COLORS.length - 1 - revStep];
            onUpdate([...letterColors]);
            step++;
          } else {
            letterColors[i] = "#000000";
            onUpdate([...letterColors]);
            clearInterval(iv);
          }
        }
      }, 50);
    }, i * stagger);
  }
}

export function makeLetterColors(text: string): string[] {
  return text.split("").map(() => "#000000");
}
