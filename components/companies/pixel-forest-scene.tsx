import { SceneRoot } from "@/components/scenes/scene-root";

const rainDrops = [
  "left-[6%] top-[6%]",
  "left-[12%] top-[28%]",
  "left-[18%] top-[12%]",
  "left-[24%] top-[34%]",
  "left-[31%] top-[8%]",
  "left-[38%] top-[22%]",
  "left-[44%] top-[4%]",
  "left-[51%] top-[30%]",
  "left-[58%] top-[12%]",
  "left-[64%] top-[36%]",
  "left-[71%] top-[8%]",
  "left-[78%] top-[28%]",
  "left-[84%] top-[14%]",
  "left-[91%] top-[34%]",
  "left-[96%] top-[10%]"
] as const;

const treePositions = [
  "left-[5%] bottom-[12%] h-[34%] w-[10%]",
  "left-[15%] bottom-[10%] h-[48%] w-[12%]",
  "left-[28%] bottom-[9%] h-[38%] w-[10%]",
  "left-[43%] bottom-[11%] h-[52%] w-[13%]",
  "left-[58%] bottom-[10%] h-[40%] w-[10%]",
  "left-[70%] bottom-[8%] h-[50%] w-[12%]",
  "left-[84%] bottom-[10%] h-[36%] w-[10%]"
] as const;

export function PixelForestScene() {
  return (
    <SceneRoot className="companies-forest-scene">
      <div className="companies-forest-sky">
        <span className="companies-forest-glow" />
        <span className="companies-forest-mist companies-forest-mist--one" />
        <span className="companies-forest-mist companies-forest-mist--two" />
      </div>

      <div className="companies-forest-ridge companies-forest-ridge--far" />
      <div className="companies-forest-ridge companies-forest-ridge--mid" />

      {treePositions.map((position, index) => (
        <div key={position} className={`companies-forest-tree ${position}`}>
          <span className="companies-forest-tree__crown" />
          <span className="companies-forest-tree__trunk" />
          <span className="companies-forest-tree__glow" style={{ animationDelay: `${index * -0.8}s` }} />
        </div>
      ))}

      <div className="companies-forest-ground">
        <span className="companies-forest-puddle companies-forest-puddle--one" />
        <span className="companies-forest-puddle companies-forest-puddle--two" />
      </div>

      <div className="companies-forest-rain">
        {rainDrops.map((position, index) => (
          <span
            key={position}
            className={`companies-forest-raindrop ${position}`}
            style={{ animationDelay: `${index * -0.18}s` }}
          />
        ))}
      </div>

      <div className="companies-forest-vignette" />
    </SceneRoot>
  );
}
