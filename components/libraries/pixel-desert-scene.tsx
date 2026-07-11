const cactusPositions = [
  "left-[3%] h-[58%]",
  "left-[10%] h-[78%]",
  "left-[17%] h-[64%]",
  "left-[27%] h-[72%]",
  "left-[38%] h-[52%]",
  "left-[67%] h-[62%]",
  "left-[76%] h-[84%]",
  "left-[86%] h-[70%]",
  "left-[94%] h-[56%]"
] as const;

const dustPositions = [
  "left-[10%] top-[72%]",
  "left-[25%] top-[61%]",
  "left-[46%] top-[76%]",
  "left-[63%] top-[66%]",
  "left-[82%] top-[73%]"
] as const;

export function PixelDesertScene() {
  return (
    <div className="libraries-desert-scene" aria-hidden="true">
      <div className="libraries-desert-sky">
        <span className="libraries-desert-sun" />
        <span className="libraries-desert-cloud libraries-desert-cloud--one" />
        <span className="libraries-desert-cloud libraries-desert-cloud--two" />
        <span className="libraries-desert-light libraries-desert-light--one" />
        <span className="libraries-desert-light libraries-desert-light--two" />
      </div>

      <div className="libraries-desert-mountain libraries-desert-mountain--back" />
      <div className="libraries-desert-mountain libraries-desert-mountain--front" />

      <div className="libraries-desert-rider">
        <span className="libraries-desert-horse__body" />
        <span className="libraries-desert-horse__head" />
        <span className="libraries-desert-horse__tail" />
        <span className="libraries-desert-horse__leg libraries-desert-horse__leg--one" />
        <span className="libraries-desert-horse__leg libraries-desert-horse__leg--two" />
        <span className="libraries-desert-cowboy__body" />
        <span className="libraries-desert-cowboy__hat" />
        <span className="libraries-desert-cowboy__rope" />
      </div>

      <div className="libraries-desert-cow">
        <span className="libraries-desert-cow__body" />
        <span className="libraries-desert-cow__head" />
        <span className="libraries-desert-cow__horn libraries-desert-cow__horn--one" />
        <span className="libraries-desert-cow__horn libraries-desert-cow__horn--two" />
        <span className="libraries-desert-cow__leg libraries-desert-cow__leg--one" />
        <span className="libraries-desert-cow__leg libraries-desert-cow__leg--two" />
      </div>

      <div className="libraries-desert-ground">
        <span className="libraries-desert-dune libraries-desert-dune--one" />
        <span className="libraries-desert-dune libraries-desert-dune--two" />
        <span className="libraries-desert-dune libraries-desert-dune--three" />

        {cactusPositions.map((position, index) => (
          <span
            key={position}
            className={`libraries-desert-cactus ${position}`}
            style={{ animationDelay: `${index * -0.7}s` }}
          />
        ))}
      </div>

      {dustPositions.map((position, index) => (
        <span
          key={position}
          className={`libraries-desert-dust ${position}`}
          style={{ animationDelay: `${index * -0.6}s` }}
        />
      ))}

      <div className="libraries-desert-vignette" />
    </div>
  );
}
