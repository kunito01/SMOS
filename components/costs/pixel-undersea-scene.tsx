const bubblePositions = [
  "left-[7%] top-[58%]",
  "left-[13%] top-[34%]",
  "left-[20%] top-[68%]",
  "left-[31%] top-[28%]",
  "left-[44%] top-[52%]",
  "left-[58%] top-[22%]",
  "left-[72%] top-[58%]",
  "left-[84%] top-[31%]",
  "left-[93%] top-[66%]"
] as const;

const seaweedPositions = [
  "left-[2%] h-[62%]",
  "left-[7%] h-[78%]",
  "left-[13%] h-[58%]",
  "left-[20%] h-[72%]",
  "left-[29%] h-[54%]",
  "left-[37%] h-[68%]",
  "left-[47%] h-[46%]",
  "left-[65%] h-[60%]",
  "left-[72%] h-[76%]",
  "left-[79%] h-[64%]",
  "left-[86%] h-[82%]",
  "left-[94%] h-[58%]"
] as const;

export function PixelUnderseaScene() {
  return (
    <div className="costs-undersea-scene" aria-hidden="true">
      <div className="costs-undersea-light costs-undersea-light--one" />
      <div className="costs-undersea-light costs-undersea-light--two" />
      <div className="costs-undersea-current costs-undersea-current--one" />
      <div className="costs-undersea-current costs-undersea-current--two" />

      <div className="costs-undersea-whale">
        <span className="costs-undersea-whale__body" />
        <span className="costs-undersea-whale__tail" />
        <span className="costs-undersea-whale__fin" />
        <span className="costs-undersea-whale__eye" />
      </div>

      <div className="costs-undersea-squid">
        <span className="costs-undersea-squid__head" />
        <span className="costs-undersea-squid__eye costs-undersea-squid__eye--one" />
        <span className="costs-undersea-squid__eye costs-undersea-squid__eye--two" />
        <span className="costs-undersea-squid__tentacle costs-undersea-squid__tentacle--one" />
        <span className="costs-undersea-squid__tentacle costs-undersea-squid__tentacle--two" />
        <span className="costs-undersea-squid__tentacle costs-undersea-squid__tentacle--three" />
      </div>

      {bubblePositions.map((position, index) => (
        <span
          key={position}
          className={`costs-undersea-bubble ${position}`}
          style={{ animationDelay: `${index * -0.55}s` }}
        />
      ))}

      <div className="costs-undersea-seafloor">
        {seaweedPositions.map((position, index) => (
          <span
            key={position}
            className={`costs-undersea-seaweed ${position}`}
            style={{ animationDelay: `${index * -0.45}s` }}
          />
        ))}
      </div>

      <div className="costs-undersea-vignette" />
    </div>
  );
}
