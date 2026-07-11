export const defaultProjectPhaseNames = [
  "Planning",
  "Design",
  "Asset Production",
  "Development",
  "Launch"
] as const;

const millisecondsPerDay = 24 * 60 * 60 * 1000;

const parseDate = (value: string) => {
  const milliseconds = Date.parse(`${value}T00:00:00Z`);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(milliseconds)) {
    throw new Error(`Invalid project date: ${value}`);
  }

  return milliseconds;
};

const formatDate = (milliseconds: number) => new Date(milliseconds).toISOString().slice(0, 10);

export const buildProjectPhaseDateRanges = (
  startDate: string,
  endDate: string,
  phaseCount: number = defaultProjectPhaseNames.length
) => {
  const start = parseDate(startDate);
  const end = parseDate(endDate);

  if (end < start) {
    throw new Error("Project end date must not be earlier than the start date");
  }

  if (!Number.isInteger(phaseCount) || phaseCount <= 0) {
    throw new Error("Phase count must be a positive integer");
  }

  const totalDays = Math.floor((end - start) / millisecondsPerDay) + 1;

  return Array.from({ length: phaseCount }, (_, index) => {
    const startOffset = Math.min(totalDays - 1, Math.floor((totalDays * index) / phaseCount));
    const nextOffset = Math.min(totalDays, Math.floor((totalDays * (index + 1)) / phaseCount));
    const endOffset = Math.max(startOffset, nextOffset - 1);

    return {
      startDate: formatDate(start + startOffset * millisecondsPerDay),
      endDate: formatDate(start + endOffset * millisecondsPerDay)
    };
  });
};
