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
              remind_before_min: { ...N, description: 'Only if the user asks to be reminded N minutes before the time ("remind me 30 min before"). A task with a clock time already gets a 15 min reminder by default.' },
              remind_at: { ...S, description: 'Only if the user names the reminder moment itself ("remind me at 5pm"): YYYY-MM-DDTHH:mm in the user local zone' },
              no_reminder: { type: 'BOOLEAN', description: 'true if the user says they do not want a reminder for this task' },
              someday: { type: 'BOOLEAN', description: 'true if the user wants to KEEP this for later without doing it soon ("someday learn guitar", "maybe one day...", "park this", "idea:"): it goes to the Someday list, not today' },
              already_done: { type: 'BOOLEAN', description: 'true only if the user says they ALREADY did it ("just called mom", "already paid the bill"): the task is logged and ticked off in one go' },
            },
            required: ['text'],
          },
        },
      },
      required: ['items'],
    },
  },
  {
    name: 'park_tasks',
    description: 'Move existing tasks to the Someday list ("park it", "not now", "someday", "maybe later", "I do not want to see this every day"). Each ref is a list number or the task text. Not for repeating tasks.',
    parameters: { type: 'OBJECT', properties: { refs: { type: 'ARRAY', items: S } }, required: ['refs'] },
  },
  {
    name: 'show_someday',
    description: 'Show the Someday list, or with pick=true suggest three parked tasks to try now (the user says they are bored, free, have time, or asks what they could do).',
    parameters: { type: 'OBJECT', properties: { pick: { type: 'BOOLEAN' } } },
  },
  {
    name: 'complete_tasks',
    description: 'Mark tasks done. Each ref is a list number ("2") or the task text.',
    parameters: { type: 'OBJECT', properties: { refs: { type: 'ARRAY', items: S } }, required: ['refs'] },
  },
  {
    name: 'defer_task',
    description: 'Move a task to another day (default tomorrow). Only when the user explicitly asks to move or postpone it; never because they are skipping, tired or making an excuse.',
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
    description:
      'Send a friend a nudge. The friend sees the message as written BY THE USER, so set `message` only to words the user ' +
      'explicitly asked to send (e.g. "tell ali: you got this"). Never invent, rephrase or add a message; comments about ' +
      'the friend ("he is slacking") are not a message: omit it.',
    parameters: { type: 'OBJECT', properties: { name: S, message: S }, required: ['name'] },
  },
  {
    name: 'react_to_friend',
    description: 'React with an emoji to what a friend finished today.',
    parameters: { type: 'OBJECT', properties: { name: S, emoji: S }, required: ['name', 'emoji'] },
  },
  { name: 'friends_today', description: 'Show what friends did today.', parameters: { type: 'OBJECT', properties: {} } },
  {
    name: 'set_reminder',
    description: 'Set or change the reminder of an EXISTING task (ref = list number or task text), or turn it off. Give remind_at (absolute) or minutes_before (relative to the task time or deadline).',
    parameters: {
      type: 'OBJECT',
      properties: {
        ref: S,
        remind_at: { ...S, description: 'YYYY-MM-DDTHH:mm in the user local zone' },
        minutes_before: N,
        off: { type: 'BOOLEAN', description: 'true to remove the reminder' },
      },
      required: ['ref'],
    },
  },
  {
    name: 'set_reminder_channel',
    description: 'Where reminders are delivered: "app" (phone notification), "whatsapp", "both", or "auto" (app if installed, else WhatsApp).',
    parameters: { type: 'OBJECT', properties: { channel: { ...S, enum: ['auto', 'app', 'whatsapp', 'both'] } }, required: ['channel'] },
  },
  {
    name: 'set_schedule',
    description: 'Set the daily check-in and/or evening recap time (local HH:mm, 24h). Use "off" to disable.',
    parameters: { type: 'OBJECT', properties: { checkin_time: S, recap_time: S } },
  },
  {
    name: 'set_language',
    description: 'Switch the language the bot answers in, when the user asks for it ("reply in Malayalam", "hindi mein bolo", "speak Urdu").',
    parameters: {
      type: 'OBJECT',
      properties: { language: { ...S, enum: ['en', 'hi', 'ur', 'ml'], description: 'en English, hi Hindi, ur Urdu, ml Malayalam' } },
      required: ['language'],
    },
  },
  {
    name: 'add_medication',
    description:
      'Set up a daily WhatsApp medicine reminder for a family member the user looks after (they get a message with a Taken button; the user is told if they do not confirm). ' +
      'Only for people already set up; use it when the user says "remind Amma to take her BP tablet at 8am and 9pm".',
    parameters: {
      type: 'OBJECT',
      properties: {
        person: { ...S, description: 'Who, as the user calls them ("Amma", "Dad"). Omit if the user did not say.' },
        medicine: { ...S, description: 'Medicine name or purpose, as said ("BP tablet", "thyroid")' },
        times: { type: 'ARRAY', items: S, description: 'Daily times, 24h HH:mm in the user local zone, e.g. ["08:00","21:00"]' },
      },
      required: ['medicine', 'times'],
    },
  },
  {
    name: 'remove_medication',
    description: 'Stop a daily medicine reminder for a family member.',
    parameters: {
      type: 'OBJECT',
      properties: { person: { ...S, description: 'Who, as the user calls them. Omit if not said.' }, medicine: S },
      required: ['medicine'],
    },
  },
  {
    name: 'set_coach',
    description: 'Switch the coach personality that talks to the user.',
    parameters: {
      type: 'OBJECT',
      properties: { coach: { ...S, enum: ['buddy', 'drill', 'hype', 'stoic', 'zen', 'analyst'] } },
      required: ['coach'],
    },
  },
  {
    name: 'send_meme',
    description:
      "Send a meme, GIF or sticker in the coach's style along with your reply. Use when the user makes an excuse, says they are " +
      'tired, brags, or asks for a meme/GIF/sticker. At most once per message; the app limits how many go out.',
    parameters: {
      type: 'OBJECT',
      properties: {
        moment: { ...S, enum: ['excuse', 'tired', 'brag', 'deferred', 'workout', 'all_done', 'random'] },
        topic: { ...S, description: 'Short subject: the task, or what they asked for ("david goggins", "cat gym fail")' },
        format: { ...S, enum: ['meme', 'gif', 'sticker'], description: 'Only if the user asked for a specific kind' },
        asked: { type: 'BOOLEAN', description: 'true only if the user explicitly asked for a meme/GIF/sticker' },
      },
      required: ['moment'],
    },
  },
  {
    name: 'reply',
    description: 'Say something to the user: chit-chat, an answer, a clarifying question, or a one-line confirmation in their language.',
    parameters: { type: 'OBJECT', properties: { text: S }, required: ['text'] },
  },
];
