import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
  ResetPassword: { email: string };
};

export type TabParamList = {
  Home: undefined;
  Explore: undefined;
  Search: undefined;
  Blog: undefined;
};

export type MainStackParamList = {
  Tabs: undefined;
  TripDetail: { tripId: string };
  BlogPost: { postId: string };
  Destination: { city: string };
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainStackParamList>;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
