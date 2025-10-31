function applyFilterToPixels(data, mode, intensity) {
  const len = data.length;
  const factor = parseFloat(intensity);

  for (let i = 0; i < len; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    if (mode === 'RED FILTER') {
      // Simulate red gelatin: block blue and green wavelengths
      b *= 1.0 - 0.9 * factor;  // strongly reduce blue
      g *= 1.0 - 0.6 * factor;  // reduce green
      // keep red mostly unchanged
    } 
    else if (mode === 'BLUE FILTER') {
      // Simulate blue gelatin: block red and some green
      r *= 1.0 - 0.9 * factor;  // strongly reduce red
      g *= 1.0 - 0.5 * factor;  // moderate reduction in green
      // keep blue mostly unchanged
    }

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}
