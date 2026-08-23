import { createNavigationContainerRef } from '@react-navigation/native';

// Shared nav ref (usable outside React tree, e.g. PlayerProvider play-fail prompt)
export const navRef = createNavigationContainerRef<ReactNavigation.RootParamList>();
