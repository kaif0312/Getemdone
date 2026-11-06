// App entry. expo-router first (it registers the root component), then the home-screen widgets: the Android widget task
// handler runs headless in this same bundle, and importing the iOS layouts registers them with the widget extension.
import 'expo-router/entry';
import { Platform } from 'react-native';

if (Platform.OS === 'android') {
  require('./src/widgets/android/handler').registerAndroidWidgets();
} else if (Platform.OS === 'ios') {
  require('./src/widgets/ios');
}
