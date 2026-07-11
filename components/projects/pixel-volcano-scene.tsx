const emberPositions = [
  "left-[43%] top-[24%]",
  "left-[48%] top-[15%]",
  "left-[52%] top-[20%]",
  "left-[57%] top-[12%]",
  "left-[62%] top-[26%]",
  "left-[68%] top-[18%]",
  "left-[75%] top-[31%]",
  "left-[81%] top-[22%]"
] as const;

const ashPositions = [
  "left-[11%] top-[16%]",
  "left-[20%] top-[34%]",
  "left-[31%] top-[18%]",
  "left-[39%] top-[42%]",
  "left-[71%] top-[12%]",
  "left-[86%] top-[36%]"
] as const;

export function PixelVolcanoScene() {
  return (
    <div className="projects-volcano-scene" aria-hidden="true">
      <div className="projects-volcano-sky">
        <span className="projects-volcano-sun" />
        <span className="projects-volcano-cloud projects-volcano-cloud--one" />
        <span className="projects-volcano-cloud projects-volcano-cloud--two" />
        <span className="projects-volcano-light projects-volcano-light--one" />
        <span className="projects-volcano-light projects-volcano-light--two" />
      </div>

      <div className="projects-volcano-plume">
        <span className="projects-volcano-plume__core" />
        <span className="projects-volcano-plume__puff projects-volcano-plume__puff--one" />
        <span className="projects-volcano-plume__puff projects-volcano-plume__puff--two" />
        <span className="projects-volcano-plume__puff projects-volcano-plume__puff--three" />
      </div>

      <div className="projects-volcano-ridge projects-volcano-ridge--back" />
      <div className="projects-volcano-cone">
        <span className="projects-volcano-crater" />
        <span className="projects-volcano-lava projects-volcano-lava--one" />
        <span className="projects-volcano-lava projects-volcano-lava--two" />
        <span className="projects-volcano-lava projects-volcano-lava--three" />
      </div>
      <div className="projects-volcano-ridge projects-volcano-ridge--front" />

      {emberPositions.map((position, index) => (
        <span
          key={position}
          className={`projects-volcano-ember ${position}`}
          style={{ animationDelay: `${index * -0.24}s` }}
        />
      ))}

      {ashPositions.map((position, index) => (
        <span
          key={position}
          className={`projects-volcano-ash ${position}`}
          style={{ animationDelay: `${index * -0.9}s` }}
        />
      ))}

      <div className="projects-volcano-ground">
        <span className="projects-volcano-reflection projects-volcano-reflection--one" />
        <span className="projects-volcano-reflection projects-volcano-reflection--two" />
      </div>
      <div className="projects-volcano-vignette" />
    </div>
  );
}
