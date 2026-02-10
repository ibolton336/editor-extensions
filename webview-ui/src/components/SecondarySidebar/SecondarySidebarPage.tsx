import React from "react";
import {
  Page,
  PageSection,
  Title,
  EmptyState,
  EmptyStateBody,
  EmptyStateHeader,
  EmptyStateIcon,
} from "@patternfly/react-core";
import { CubesIcon } from "@patternfly/react-icons";

export const SecondarySidebarPage: React.FC = () => {
  return (
    <Page>
      <PageSection>
        <Title headingLevel="h1" size="xl" style={{ marginBottom: "1rem" }}>
          Konveyor
        </Title>
        <EmptyState>
          <EmptyStateHeader
            titleText="Secondary Sidebar (Experimental)"
            headingLevel="h2"
            icon={<EmptyStateIcon icon={CubesIcon} />}
          />
          <EmptyStateBody>
            This is an experimental view in the secondary sidebar. More features will be added here
            in future releases.
          </EmptyStateBody>
        </EmptyState>
      </PageSection>
    </Page>
  );
};
