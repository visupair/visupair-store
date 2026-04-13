import { BasketIcon, FolderIcon, PackageIcon, ImageIcon, CubeIcon, ComposeIcon, BillIcon } from '@sanity/icons'

export const structure = (S) =>
    S.list()
        .title('Content')
        .items([
            // Orders Section
            S.listItem()
                .title('Orders')
                .icon(BillIcon)
                .child(
                    S.list()
                        .title('Order Management')
                        .items([
                            // All Orders
                            S.listItem()
                                .title('All Orders')
                                .icon(BillIcon)
                                .child(
                                    S.documentTypeList('order')
                                        .title('All Orders')
                                ),
                            S.divider(),
                            // By Type
                            S.listItem()
                                .title('Physical Orders')
                                .icon(PackageIcon)
                                .child(
                                    S.documentList()
                                        .title('Physical Orders')
                                        .filter('_type == "order" && orderType == "physical"')
                                ),
                            S.listItem()
                                .title('Digital Orders')
                                .icon(CubeIcon)
                                .child(
                                    S.documentList()
                                        .title('Digital Orders')
                                        .filter('_type == "order" && orderType == "digital"')
                                ),
                            S.listItem()
                                .title('Mixed Orders')
                                .icon(BasketIcon)
                                .child(
                                    S.documentList()
                                        .title('Mixed Orders')
                                        .filter('_type == "order" && orderType == "mixed"')
                                ),
                            S.divider(),
                            // By Status
                            S.listItem()
                                .title('Processing (payment)')
                                .icon(ComposeIcon)
                                .child(
                                    S.documentList()
                                        .title('Processing')
                                        .filter('_type == "order" && status == "processing"')
                                ),
                            S.listItem()
                                .title('Paid Orders')
                                .icon(BillIcon)
                                .child(
                                    S.documentList()
                                        .title('Paid Orders')
                                        .filter('_type == "order" && status == "paid"')
                                ),
                            S.listItem()
                                .title('Shipped / Delivered')
                                .icon(PackageIcon)
                                .child(
                                    S.documentList()
                                        .title('Shipped or Delivered')
                                        .filter(
                                            '_type == "order" && (shippingTimelineStage == "shipped" || shippingTimelineStage == "delivered" || status == "shipped" || status == "delivered")',
                                        )
                                ),
                        ])
                ),

            // Store section with nested categories and products
            S.listItem()
                .title('Store')
                .icon(BasketIcon)
                .child(
                    S.list()
                        .title('Store Management')
                        .items([
                            // Categories
                            S.listItem()
                                .title('Categories')
                                .icon(FolderIcon)
                                .child(
                                    S.documentTypeList('category')
                                        .title('Categories')
                                ),

                            // Products with hierarchical structure
                            S.listItem()
                                .title('Products')
                                .icon(PackageIcon)
                                .child(
                                    S.list()
                                        .title('Products by Department')
                                        .items([
                                            // ==========================
                                            // GARMENTS (department: fashion)
                                            // ==========================
                                            S.listItem()
                                                .title('Garments')
                                                .icon(ComposeIcon)
                                                .child(
                                                    S.list()
                                                        .title('Garments — products')
                                                        .items([
                                                            // Physical Products
                                                            S.listItem()
                                                                .title('Physical Products')
                                                                .icon(PackageIcon)
                                                                .child(
                                                                    S.documentTypeList('category')
                                                                        .title('Physical Categories')
                                                                        .filter('_type == "category" && department == "fashion"')
                                                                        .child(categoryId =>
                                                                            S.documentList()
                                                                                .title('Products')
                                                                                .filter('_type == "product" && department == "fashion" && productType == "physical" && category._ref == $categoryId')
                                                                                .params({ categoryId })
                                                                        )
                                                                ),

                                                            // Digital Products
                                                            S.listItem()
                                                                .title('Digital Products')
                                                                .icon(CubeIcon)
                                                                .child(
                                                                    S.documentTypeList('category')
                                                                        .title('Digital Categories')
                                                                        .filter('_type == "category" && department == "fashion"')
                                                                        .child(categoryId =>
                                                                            S.documentList()
                                                                                .title('Products')
                                                                                .filter('_type == "product" && department == "fashion" && productType == "digital" && category._ref == $categoryId')
                                                                                .params({ categoryId })
                                                                        )
                                                                ),

                                                            // All garments (fashion department) products
                                                            S.divider(),
                                                            S.listItem()
                                                                .title('All Garments Products')
                                                                .icon(PackageIcon)
                                                                .child(
                                                                    S.documentList()
                                                                        .title('All Garments Products')
                                                                        .filter('_type == "product" && department == "fashion"')
                                                                ),
                                                        ])
                                                ),

                                            // ==========================
                                            // 3D MODELS
                                            // ==========================
                                            S.listItem()
                                                .title('3D Models')
                                                .icon(CubeIcon)
                                                .child(
                                                    S.list()
                                                        .title('3D Models Products')
                                                        .items([
                                                            // Provide a list of categories to choose from
                                                            S.listItem()
                                                                .title('By Category')
                                                                .icon(FolderIcon)
                                                                .child(
                                                                    S.documentTypeList('category')
                                                                        .title('3D Model Categories')
                                                                        .filter('_type == "category" && department == "3d-models"')
                                                                        .child(categoryId =>
                                                                            S.documentList()
                                                                                .title('Products')
                                                                                .filter('_type == "product" && department == "3d-models" && category._ref == $categoryId')
                                                                                .params({ categoryId })
                                                                        )
                                                                ),

                                                            // All 3D Models
                                                            S.divider(),
                                                            S.listItem()
                                                                .title('All 3D Models')
                                                                .icon(PackageIcon)
                                                                .child(
                                                                    S.documentList()
                                                                        .title('All 3D Models')
                                                                        .filter('_type == "product" && department == "3d-models"')
                                                                ),
                                                        ])
                                                ),

                                            // ==========================
                                            // ARTWORKS
                                            // ==========================
                                            S.listItem()
                                                .title('Artworks')
                                                .icon(ImageIcon)
                                                .child(
                                                    S.list()
                                                        .title('Artworks Products')
                                                        .items([
                                                            // Provide a list of categories to choose from
                                                            S.listItem()
                                                                .title('By Category')
                                                                .icon(FolderIcon)
                                                                .child(
                                                                    S.documentTypeList('category')
                                                                        .title('Artwork Categories')
                                                                        .filter('_type == "category" && department == "artworks"')
                                                                        .child(categoryId =>
                                                                            S.documentList()
                                                                                .title('Products')
                                                                                .filter('_type == "product" && department == "artworks" && category._ref == $categoryId')
                                                                                .params({ categoryId })
                                                                        )
                                                                ),

                                                            // All Artworks
                                                            S.divider(),
                                                            S.listItem()
                                                                .title('All Artworks')
                                                                .icon(PackageIcon)
                                                                .child(
                                                                    S.documentList()
                                                                        .title('All Artworks')
                                                                        .filter('_type == "product" && department == "artworks"')
                                                                ),
                                                        ])
                                                ),

                                            // All Products (fallback)
                                            S.divider(),
                                            S.listItem()
                                                .title('All Products')
                                                .icon(PackageIcon)
                                                .child(
                                                    S.documentTypeList('product')
                                                        .title('All Products')
                                                ),
                                        ])
                                ),
                        ])
                ),

            // Portfolio Section
            S.listItem()
                .title('Portfolio')
                .icon(ImageIcon)
                .child(
                    S.list()
                        .title('Portfolio Management')
                        .items([
                            // Categories
                            S.listItem()
                                .title('Categories')
                                .icon(FolderIcon)
                                .child(
                                    S.documentTypeList('portfolioCategory')
                                        .title('Portfolio Categories')
                                ),

                            // Projects
                            S.listItem()
                                .title('Projects')
                                .icon(ImageIcon)
                                .child(
                                    S.list()
                                        .title('Projects by Category')
                                        .items([
                                            // 3D Design
                                            S.listItem()
                                                .title('3D Design')
                                                .icon(CubeIcon)
                                                .child(
                                                    S.documentList()
                                                        .title('3D Design Projects')
                                                        .filter('_type == "portfolioProject" && category->title match "3D Design*"')
                                                ),
                                            // Brand Identity Design
                                            S.listItem()
                                                .title('Brand Identity Design')
                                                .icon(ImageIcon)
                                                .child(
                                                    S.documentList()
                                                        .title('Brand Identity Design Projects')
                                                        .filter('_type == "portfolioProject" && category->title match "Brand Identity Design*"')
                                                ),
                                            // Fashion Design (portfolio category — store uses “Garments” separately)
                                            S.listItem()
                                                .title('Fashion Design')
                                                .icon(ComposeIcon)
                                                .child(
                                                    S.documentList()
                                                        .title('Fashion Design Projects')
                                                        .filter('_type == "portfolioProject" && category->title match "Fashion Design*"')
                                                ),
                                            // Graphic Design
                                            S.listItem()
                                                .title('Graphic Design')
                                                .icon(ImageIcon)
                                                .child(
                                                    S.documentList()
                                                        .title('Graphic Design Projects')
                                                        .filter('_type == "portfolioProject" && category->title match "Graphic Design*"')
                                                ),
                                            // Web Design
                                            S.listItem()
                                                .title('Web Design')
                                                .icon(ImageIcon)
                                                .child(
                                                    S.documentList()
                                                        .title('Web Design Projects')
                                                        .filter('_type == "portfolioProject" && category->title match "Web Design*"')
                                                ),
                                            // All Projects
                                            S.divider(),
                                            S.listItem()
                                                .title('All Projects')
                                                .icon(ImageIcon)
                                                .child(
                                                    S.documentTypeList('portfolioProject')
                                                        .title('All Projects')
                                                ),
                                        ])
                                ),
                        ])
                ),

            // Courses section
            S.listItem()
                .title('Courses')
                .icon(ComposeIcon)
                .child(
                    S.documentTypeList('course')
                        .title('All Courses')
                ),

            // Services Section
            S.listItem()
                .title('Services')
                .icon(ComposeIcon)
                .child(
                    S.list()
                        .title('Services Management')
                        .items([
                            // Service Offerings
                            S.listItem()
                                .title('Service Offerings')
                                .icon(ComposeIcon)
                                .child(
                                    S.documentTypeList('service')
                                        .title('All Services')
                                        .defaultOrdering([{field: 'sortOrder', direction: 'asc'}])
                                ),
                            // Proposals
                            S.listItem()
                                .title('Requested Proposals')
                                .icon(PackageIcon)
                                .child(
                                    S.documentTypeList('proposal')
                                        .title('All Proposals')
                                ),
                        ])
                ),

            // Divider
            S.divider(),

            // All other document types (automatically includes any other schemas)
            ...S.documentTypeListItems().filter(
                (listItem) => !['category', 'product', 'portfolioCategory', 'portfolioProject', 'course', 'service', 'proposal', 'order'].includes(listItem.getId())
            ),
        ]);
