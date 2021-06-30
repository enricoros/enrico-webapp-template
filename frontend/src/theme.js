import { createMuiTheme } from '@material-ui/core/styles';

// Create a theme instance.
const theme = createMuiTheme({
  palette: {
    primary: {
      main: '#3B88C3',
    },/*
    secondary: {
      main: '#C1694F',
    },*/
    background: {
      default: '#fff',
    },
  },
});

export default theme;