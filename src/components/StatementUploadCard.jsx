// Import telemetry utility
import { trackEvent } from '../utils/telemetry';

// Replace direct telemetry calls with utility
telemetryEvents.upload_started = () => trackEvent('upload_started');
telemetryEvents.upload_failed = (error) => trackEvent('upload_failed', { error });
telemetryEvents.duplicates_detected = (duplicates) => trackEvent('duplicates_detected', { duplicates });
telemetryEvents.import_confirmed = () => trackEvent('import_confirmed');
telemetryEvents.import_completed = () => trackEvent('import_completed');