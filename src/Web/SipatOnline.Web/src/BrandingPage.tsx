import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getCompanyCapabilities, type CompanyCapabilities, type TenantBranding } from '@/api';
import { Page, PageHeader } from '@/components/ui/page';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CertificateTemplatePage from './CertificateTemplatePage';
import TenantAppearancePage from './TenantAppearancePage';

type Tab = 'portal' | 'certificado';

/**
 * The company's look in one place: the portal its people see (logo, colors, banner) and the certificate they get.
 * Each tab saves on its own; the address keeps the tab (?aba=certificado), so a link opens straight on the certificate.
 * A plan without one of them shows only the other, without the tabs.
 */
export default function BrandingPage({ tenant, onSaved }: {
  tenant: TenantBranding;
  onSaved: (tenant: TenantBranding) => void;
}) {
  const [params, setParams] = useSearchParams();
  const [capabilities, setCapabilities] = useState<CompanyCapabilities | null>(null);
  useEffect(() => {
    let current = true;
    // unknown (still loading, or the call failed): both tabs, as the menu does
    getCompanyCapabilities().then(result => { if (current) setCapabilities(result); }, () => undefined);
    return () => { current = false; };
  }, []);

  const portal = capabilities?.customBranding !== false;
  const certificate = capabilities?.customCertificate !== false;
  const tab: Tab = (params.get('aba') === 'certificado' && certificate) || !portal ? 'certificado' : 'portal';
  const choose = (value: string) => setParams(value === 'certificado' ? { aba: 'certificado' } : {}, { replace: true });

  return (
    <div className="page-content">
      <Page>
        <PageHeader
          description="O portal que os colaboradores da sua empresa veem e o certificado que eles recebem."
          eyebrow="PORTAL DA EMPRESA"
          title="Identidade visual"
        />
        <Tabs onValueChange={choose} value={tab}>
          {portal && certificate && <TabsList aria-label="Identidade visual">
            <TabsTrigger value="portal">Portal</TabsTrigger>
            <TabsTrigger value="certificado">Certificado</TabsTrigger>
          </TabsList>}
          {portal && <TabsContent value="portal"><TenantAppearancePage embedded onSaved={onSaved} tenant={tenant} /></TabsContent>}
          {certificate && <TabsContent value="certificado"><CertificateTemplatePage embedded tenant={tenant} /></TabsContent>}
        </Tabs>
      </Page>
    </div>
  );
}
