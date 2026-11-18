export type Requirements = { width: string; height: string; minimum: string };

export function readRequirements(values: Requirements, maximumKB: number) {
  const width = Number(values.width);
  const height = Number(values.height);
  const minimum = Number(values.minimum);
  if (
    [width, height].some(
      (value) => !Number.isInteger(value) || value < 0 || value > 4096,
    ) ||
    Boolean(values.width) !== Boolean(values.height) ||
    (values.width && (!width || !height))
  ) {
    throw new RangeError(
      'Enter both width and height, from 1 to 4096 pixels, or leave both blank.',
    );
  }
  if (!Number.isInteger(minimum) || minimum < 0 || minimum > maximumKB) {
    throw new RangeError(
      'The minimum size must be at or below the form’s maximum.',
    );
  }
  return { width, height, minimumBytes: minimum * 1000 };
}
