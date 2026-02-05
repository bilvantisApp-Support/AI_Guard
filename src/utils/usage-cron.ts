import cron from 'node-cron';
import { projectRepository } from '../database/repositories/project.repository';
import { logger } from '../utils/logger';

export function resetDailyAndMonthlyUsage() {

    //reset the daily usage 
    cron.schedule('0 0 * * *', async () => {
        logger.info('Running daily usage reset');
        try {
            await projectRepository.resetDailyUsage();
        } catch (err) {
            logger.error('Daily usage reset failed', err);
        }
    });

    //reset monthly usage
    cron.schedule('0 0 1 * *', async () => {
        logger.info('Running monthly usage reset');
        try {
            await projectRepository.resetMonthlyUsage();
        } catch (err) {
            logger.error('Monthly usage reset failed', err);
        }
    });

}
