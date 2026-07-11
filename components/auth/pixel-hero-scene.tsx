const cloudRows = [
  "left-[6%] top-[13%] w-36",
  "left-[16%] top-[25%] w-28",
  "left-[56%] top-[16%] w-32",
  "left-[72%] top-[28%] w-24"
] as const;

const farBuildings = [
  "left-[8%] bottom-[22%] h-[21%] w-[8%]",
  "left-[18%] bottom-[22%] h-[30%] w-[7%]",
  "left-[28%] bottom-[22%] h-[24%] w-[8%]",
  "left-[39%] bottom-[22%] h-[43%] w-[10%]",
  "left-[53%] bottom-[22%] h-[28%] w-[8%]",
  "left-[65%] bottom-[22%] h-[34%] w-[9%]",
  "left-[79%] bottom-[22%] h-[26%] w-[8%]"
] as const;

const nearBuildings = [
  "left-[0%] bottom-0 h-[22%] w-[11%]",
  "left-[11%] bottom-0 h-[31%] w-[13%]",
  "left-[25%] bottom-0 h-[24%] w-[9%]",
  "left-[36%] bottom-0 h-[34%] w-[12%]",
  "left-[50%] bottom-0 h-[26%] w-[11%]",
  "left-[64%] bottom-0 h-[38%] w-[13%]",
  "left-[79%] bottom-0 h-[28%] w-[10%]",
  "left-[90%] bottom-0 h-[36%] w-[10%]"
] as const;

function PixelCloud({ className }: { className: string }) {
  return (
    <div className={`pixel-cloud ${className}`} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

function BuildingWindows({ count = 15 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <span key={index} className="pixel-city-window" />
      ))}
    </>
  );
}

export function PixelHeroScene() {
  return (
    <div className="pixel-hero-scene pixel-hero-scene--pastel" aria-hidden="true">
      <div className="pixel-pastel-sky">
        <div className="pixel-pastel-sun" />
        <div className="pixel-pastel-haze pixel-pastel-haze--one" />
        <div className="pixel-pastel-haze pixel-pastel-haze--two" />
        {cloudRows.map((position) => (
          <PixelCloud key={position} className={position} />
        ))}
      </div>

      <div className="pixel-city-horizon pixel-city-horizon--far" />

      {farBuildings.map((position, index) => (
        <div key={position} className={`pixel-city-building pixel-city-building--far ${position}`}>
          <BuildingWindows count={index % 2 === 0 ? 12 : 15} />
        </div>
      ))}

      <div className="pixel-city-bridge">
        <span />
        <span />
        <span />
      </div>

      {nearBuildings.map((position, index) => (
        <div key={position} className={`pixel-city-building pixel-city-building--near ${position}`}>
          <BuildingWindows count={index % 3 === 0 ? 18 : 14} />
        </div>
      ))}

      <div className="pixel-city-ground">
        <span className="pixel-city-ground__light" />
        <span className="pixel-city-ground__reflection pixel-city-ground__reflection--one" />
        <span className="pixel-city-ground__reflection pixel-city-ground__reflection--two" />
      </div>

      <div className="pixel-pastel-vignette" />
    </div>
  );
}
