declare module "node-cron" {
  export interface ScheduledTask {
    start(): void;
    stop(): void;
    destroy(): void;
    isRunning(): boolean;
  }

  export interface CronExpression {
    nextDates(now?: Date): Date[];
  }

  export interface CronJobParams {
    cron?: string | undefined;
    onTick?: (() => void) | undefined;
    onComplete?: (() => void) | undefined;
    context?: any;
    timeZone?: string | undefined;
    start?: boolean | undefined;
  }

  export function schedule(task: string, fn: () => void, options?: any): ScheduledTask;
  export function validate(cron: string): boolean;
  export function getTasks(): Map<string, ScheduledTask>;
  export function getTask(key: string): ScheduledTask | undefined;
  export function getCronSet(): string[];
  export function select(cron: string): CronExpression;
}
