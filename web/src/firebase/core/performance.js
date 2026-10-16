import { getPerformance } from 'firebase/performance';
import { app } from './app.js';

let performanceInstance;

export function mulaiPerformanceMonitoring() {
  if (!performanceInstance) {
    try {
      performanceInstance = getPerformance(app);
    } catch (error) {
      console.error(
        '[firebase/performance] Gagal menginisialisasi Performance Monitoring:',
        error?.code || error?.message || error
      );
      throw error;
    }
  }
  return performanceInstance;
}
