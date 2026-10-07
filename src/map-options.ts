export const layerOptions = [
  ['boundaries', 'Administrative context'],
  ['cases', 'Observed malaria burden'],
  ['incidence', 'Incidence / 1,000'],
  ['prediction', 'Predicted burden'],
  ['prediction_risk', 'Predicted incidence risk'],
  ['risk', 'Derived observed incidence risk'],
  ['cluster', 'Spatial cluster (exploratory)'],
  ['rainfall', 'Rainfall (source units)'],
  ['temperature', 'Temperature (°C)'],
  ['humidity', 'Humidity (%)'],
  ['rainfall_anomaly', 'Rainfall anomaly (SD)'],
  ['temperature_anomaly', 'Temperature anomaly (SD)'],
  ['residual', 'Absolute model error (cases)'],
  ['signed_residual', 'Model residual: predicted − observed'],
  ['completeness', 'Analytical input completeness (%)'],
  ['population', 'Population'],
] as const;
export type LayerId = (typeof layerOptions)[number][0];
export const modes = [
  ['Observed Burden', 'cases'],
  ['Incidence', 'incidence'],
  ['Predicted Risk', 'prediction_risk'],
  ['Spatial Cluster', 'cluster'],
  ['Residual Error', 'residual'],
  ['Data Completeness', 'completeness'],
] as const;
