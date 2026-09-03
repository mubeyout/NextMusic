import './polyfills';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { FxScreen } from '../../src/screens/FxScreen';

const Stack = createNativeStackNavigator();
const root = createRoot(document.getElementById('root')!);
root.render(
  <NavigationContainer>
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Fx" component={FxScreen} />
    </Stack.Navigator>
  </NavigationContainer>
);
document.title = 'NextMusic-FxTest';
