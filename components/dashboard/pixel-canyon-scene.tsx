import { SceneRoot } from "@/components/scenes/scene-root";

const canyonDust = [
  "left-[16%] top-[28%]",
  "left-[30%] top-[42%]",
  "left-[48%] top-[24%]",
  "left-[68%] top-[36%]",
  "left-[82%] top-[22%]"
] as const;

export function PixelCanyonScene() {
  return (
    <SceneRoot className="dashboard-canyon-scene">
      <div className="dashboard-canyon-sky">
        <span className="dashboard-canyon-sun" />
        <span className="dashboard-canyon-cloud dashboard-canyon-cloud--one" />
        <span className="dashboard-canyon-cloud dashboard-canyon-cloud--two" />
        <span className="dashboard-canyon-light dashboard-canyon-light--one" />
        <span className="dashboard-canyon-light dashboard-canyon-light--two" />
      </div>

      <div className="dashboard-canyon-ridge dashboard-canyon-ridge--far" />
      <div className="dashboard-canyon-ridge dashboard-canyon-ridge--mid" />
      <div className="dashboard-canyon-wall dashboard-canyon-wall--left">
        <span />
        <span />
        <span />
      </div>
      <div className="dashboard-canyon-wall dashboard-canyon-wall--right">
        <span />
        <span />
        <span />
      </div>
      <div className="dashboard-canyon-floor">
        <span className="dashboard-canyon-river" />
        <span className="dashboard-canyon-river dashboard-canyon-river--second" />
      </div>

      {canyonDust.map((position, index) => (
        <span
          key={position}
          className={`dashboard-canyon-dust ${position}`}
          style={{ animationDelay: `${index * -1.25}s` }}
        />
      ))}

      <div className="dashboard-canyon-vignette" />
    </SceneRoot>
  );
}
