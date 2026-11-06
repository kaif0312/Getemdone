/** iOS widgets (expo-widgets). Importing them registers each layout with the widget extension. Imported only on iOS. */
import Today from './TodayWidget';
import Streak from './StreakWidget';
import QuickAdd from './QuickAddWidget';

export const iosWidgets = { Today, Streak, QuickAdd };
