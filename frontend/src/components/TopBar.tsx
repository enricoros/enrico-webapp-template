import React from "react";
import {
  AppBar, Avatar, Box, Button, CircularProgress, Container, Hidden,
  IconButton, Popover, Toolbar, Tooltip, Typography, makeStyles,
} from "@material-ui/core";
import StarsIcon from '@material-ui/icons/Stars';
import WarningRoundedIcon from "@material-ui/icons/WarningRounded";

// import {useAuth0} from "@auth0/auth0-react";

import {ActiveLink} from "./ActiveLink";
import {ConnectionStatus, connector} from "../logic/Connector";
import {Brand} from "../logic/Brand";
import {ServerStatusType} from "../../../common/SharedTypes";


// CSS for this component
const useStyles = makeStyles((theme) => ({
  userAvatar: {
    width: theme.spacing(4),
    height: theme.spacing(4),
  },
}));

interface PopupData {
  open: boolean,
  anchor: Element | null,
}

export function TopBar() {
  // status
  const classes = useStyles();
  const [userMenu, setUserMenu] = React.useState<PopupData>({open: false, anchor: null});

  // Authentication status
  const {isAuthenticated, isLoading, loginWithRedirect, logout, user} = { // useAuth0();
    isAuthenticated: false,
    isLoading: false,
    loginWithRedirect: (param?: object) => {
    },
    logout: () => {
    },
    user: {name: 'Enrico', picture: 'http://', nickname: 'enrico'},
  }

  // Backend Connection status
  const [connection, setConnectionStatus] = React.useState<ConnectionStatus>(null);
  React.useEffect(() => {
    const csListener = v => setConnectionStatus({...v});
    connector.connection.addSubscriber(csListener);
    return () => connector.connection.removeSubscriber(csListener);
  }, []);


  // Status element (right messaging)
  let backendStatus: JSX.Element = null;
  if (connection) {
    // if there's an error, show it
    if (!connection.errorMessage) {
      if (connection.connected) {
        const ss: ServerStatusType = connection.serverStatus || {} as ServerStatusType;
        backendStatus = <>
          {ss.isRunning && <Typography variant="h6" style={{color: 'aliceblue', marginRight: '1em', fontWeight: 200}}>
            busy
          </Typography>}
          {ss.isRunning && <CircularProgress color="secondary" size="1.8rem"/>}
          {/*<Tooltip title={*/}
          {/*  <Typography variant="body2">*/}
          {/*    Connected to <b>the server</b>*/}
          {/*  </Typography>}>*/}
          {/*  <InfoOutlinedIcon fontSize="small"/>*/}
          {/*</Tooltip>*/}
        </>;
      } else {
        // backendStatus = <>
        //   <Typography variant="h6" noWrap>
        //     Disconnected&nbsp;
        //   </Typography>
        //   <Tooltip title={<Typography variant="body2">Disconnected from the server</Typography>}>
        //     <WarningRoundedIcon/>
        //   </Tooltip>
        // </>;
      }
    } else
      backendStatus = <>
        <Typography variant="h6" noWrap>
          Connection <span style={{color: 'lightpink', fontSize: '1em'}}>{connection.errorMessage}</span>&nbsp;
          <Tooltip title={<Typography variant="body2">Issue connecting to the server</Typography>}>
            <WarningRoundedIcon/>
          </Tooltip>
        </Typography>
      </>;
  }

  // Top bar full layout
  return <AppBar position="relative" elevation={0} style={{backgroundColor: '#26272f'}}>
    <Container maxWidth={isAuthenticated ? false : 'lg'}>
      <Toolbar>
        <Hidden smDown>
          <Box mr={1} display="flex" alignItems="center">
            <ActiveLink href="/">
              <StarsIcon style={{fontSize: '2.2em', marginTop: '0.2em', color: 'white'}}/>
            </ActiveLink>
          </Box>
        </Hidden>
        <Typography noWrap component={ActiveLink} href="/" naked
                    style={{fontSize: '1.6em', fontWeight: 200, textDecoration: 'none', color: 'white'}}>
          {Brand.AppWebsite}
        </Typography>

        <Box flexGrow={1}/> {/* Expander */}

        <Box display="flex" flexDirection="row" alignItems="center" alignContent="middle">
          {backendStatus}
        </Box>

        {/* Authentication piece */}
        {isLoading ?
          <>{/* Loading ... */}</>
          :
          isAuthenticated ?
            <IconButton aria-describedby="user-menu" style={{marginLeft: '1rem'}}
                        onClick={e => setUserMenu({open: true, anchor: e.currentTarget})}>
              <Avatar alt={user.name} src={user.picture} className={classes.userAvatar}/>
            </IconButton>
            :
            <>
              <Button variant="text" color="inherit"
                      onClick={() => loginWithRedirect()}>
                Sign in
              </Button>
              <Hidden smDown>
                <Button variant="outlined" color="inherit" style={{marginInlineStart: '1em'}}
                        onClick={() => loginWithRedirect({screen_hint: 'signup'})}>
                  Sign up
                </Button>
              </Hidden>
            </>
        }
      </Toolbar>
    </Container>

    {/* Popover Settings Panel */}
    <Popover id="user-menu" open={userMenu.open} anchorEl={userMenu.anchor}
             onClose={() => setUserMenu({open: false, anchor: null})}
             anchorOrigin={{vertical: 'bottom', horizontal: 'right',}}
             transformOrigin={{vertical: 'top', horizontal: 'right',}}>
      <Box minWidth={200} style={{textAlign: 'center'}}>
        {user && <Box m={2}>
          <Typography>
            Free account
          </Typography>
          <Typography style={{marginBottom: '1em'}}>
            {user.nickname}
          </Typography>
          <Box display="flex" flexDirection="row" alignItems="center" justifyContent="center">
            <Button variant="text" fullWidth onClick={() => logout()}>
              Sign out
            </Button>
          </Box>
        </Box>}
      </Box>
    </Popover>
  </AppBar>;
}