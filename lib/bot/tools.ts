// Gemini function declarations.
import type { FunctionDecl } from './types';

const S = { type: 'STRING' };
const N = { type: 'NUMBER' };

export const TOOLS: FunctionDecl[] = [
  {
    name: 'add_tasks',
    description: 'Add one or more todo items. Split a message like "gym 6pm, call mom" into separate items.',
    parameters: {
      type: 'OBJECT',
      properties: {
        items: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              text: { ...S, description: 'Task text without the date/time words, in the user\'s language' },
              when: { ...S, description: 'Day (and time) to do it: YYYY-MM-DD or YYYY-MM-DDTHH:mm in the user\'s local zone. Omit for today.' },
              due: { ...S, description: 'Hard deadline, YYYY-MM-DD or YYYY-MM-DDTHH:mm (only when the user says "by"/"due")' },
              recurrence: { ...S, description: 'Repeat rule in plain English, e.g. "every monday", "daily"' },
            },
            required: ['text'],
          },
        },
      },
      required: ['items'],
    },
  },
  {
    name: 'complete_tasks',
    description: 'Mark tasks done. Each ref is a list number ("2") or the task text.',
    parameters: { type: 'OBJECT', properties: { refs: { type: 'ARRAY', items: S } }, required: ['refs'] },
  },
  {
    name: 'defer_task',
    description: 'Move a task to another day (default tomorrow).',
    parameters: {
      type: 'OBJECT',
      properties: { ref: S, to_date: { ...S, description: 'YYYY-MM-DD; omit for tomorrow' } },
      required: ['ref'],
    },
  },
  {
    name: 'delete_task',
    description: 'Delete a task.',
    parameters: { type: 'OBJECT', properties: { ref: S }, required: ['ref'] },
  },
  { name: 'list_today', description: 'Show the user\'s tasks for today.', parameters: { type: 'OBJECT', properties: {} } },
  {
    name: 'log_workout',
    description: 'Record a finished workout.',
    parameters: {
      type: 'OBJECT',
      properties: {
        type: { ...S, description: 'e.g. run, gym, chest day, yoga, cricket' },
        minutes: N,
        distance_km: N,
        sets: N,
        reps: N,
        note: S,
        date: { ...S, description: 'YYYY-MM-DD if not today' },
      },
      required: ['type'],
    },
  },
  {
    name: 'propose_workout',
    description: 'Use when numbers come from a photo/screenshot or are unclear: asks the user to confirm with buttons before logging.',
    parameters: {
      type: 'OBJECT',
      properties: { type: S, minutes: N, distance_km: N, sets: N, reps: N, note: S, date: S },
      required: ['type'],
    },
  },
  {
    name: 'log_metric',
    description: 'Record a daily number: steps, body weight, sleep hours, water.',
    parameters: {
      type: 'OBJECT',
      properties: {
        metric: { ...S, enum: ['steps', 'weight_kg', 'sleep_h', 'water_l'] },
        value: N,
        date: { ...S, description: 'YYYY-MM-DD if not today' },
      },
      required: ['metric', 'value'],
    },
  },
  { name: 'fitness_week', description: 'Show this week\'s fitness summary.', parameters: { type: 'OBJECT', properties: {} } },
  {
    name: 'set_goal',
    description: 'Set fitness goals.',
    parameters: {
      type: 'OBJECT',
      properties: { workouts_per_week: N, steps_per_day: N, target_weight_kg: N },
    },
  },
  {
    name: 'nudge_friend',
    description: 'Send a friend an encouraging nudge.',
    parameters: { type: 'OBJECT', properties: { name: S, message: S }, required: ['name'] },
  },
  {
    name: 'react_to_friend',
    description: 'React with an emoji to what a friend finished today.',
    parameters: { type: 'OBJECT', properties: { name: S, emoji: S }, required: ['name', 'emoji'] },
  },
  { name: 'friends_today', description: 'Show what friends did today.', parameters: { type: 'OBJECT', properties: {} } },
  {
    name: 'set_schedule',
    description: 'Set the daily check-in and/or evening recap time (local HH:mm, 24h). Use "off" to disable.',
    parameters: { type: 'OBJECT', properties: { checkin_time: S, recap_time: S } },
  },
  {
    name: 'reply',
    description: 'Say something to the user: chit-chat, an answer, a clarifying question, or a one-line confirmation in their language.',
    parameters: { type: 'OBJECT', properties: { text: S }, required: ['text'] },
  },
];
