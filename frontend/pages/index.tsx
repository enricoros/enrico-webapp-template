import React from "react";
import {Box, Container, Link as MuiLink, Typography} from "@material-ui/core";
import LockIcon from '@material-ui/icons/Lock';

// import {useAuth0} from "@auth0/auth0-react";

const EmptySection = props =>
  <Box mt={8} mb={6}><Container maxWidth="lg">
    <Typography variant="h4" style={{fontWeight: 200}}>{props.title}</Typography>
    <Typography style={{fontWeight: 200}}>{props.children}</Typography>
  </Container></Box>;

const LandingPage = () =>
  <main>
    <EmptySection title="Hi. Do I know you?">
      <Box mt={1}>
        <Typography>
          This product is in stealth mode.
        </Typography>
        <Typography>
          Registration is <strong>open</strong> and <strong>free</strong>. Please log in to continue.
        </Typography>
      </Box>
      <Box display="flex" flexDirection="row" justifyContent="center">
        <LockIcon style={{fontSize: '10rem', color: 'lightgray'}}/>
      </Box>
    </EmptySection>
  </main>;

const AuthenticatedHome = () =>
  <main>
    {/* Some Header Here */}
    {/* Some Content Here */}
    <EmptySection title="Instructions">Where we are going we don&apos;t need instructions.</EmptySection>
    <EmptySection title="Related Projects"><MuiLink href="https://www.enricoros.com/">Enrico Ros</MuiLink></EmptySection>
  </main>;

export default function HomeLayout() {
  // const {isAuthenticated} = useAuth0();
  const isAuthenticated = false;
  if (!isAuthenticated) return <LandingPage/>;
  return <AuthenticatedHome/>;
}